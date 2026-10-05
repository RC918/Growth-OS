<?php
// TEST ONLY. Installed solely by createSite({pilotFixture:true,parameterFixture:true}).
// Exercise sources normally populated by PHP/form parsing or registered route defaults.
// Uses the real authenticated HTTP request and native WordPress dispatch/controller.
add_filter('rest_request_before_callbacks', function ($response, $handler, $r) {
    switch ($r->get_header('x_growth_fixture_source')) {
        case 'default': $r->set_default_params(array_merge($r->get_default_params(), ['excerpt'=>'changed'])); break;
        case 'url': $r->set_url_params(array_merge($r->get_url_params(), ['excerpt'=>'changed'])); break;
        case 'form': $r->set_body_params(['excerpt'=>'changed']); break;
        case 'file': $r->set_file_params(['file'=>['name'=>'changed.txt']]); break;
    }
    return $response;
}, 1, 3);
